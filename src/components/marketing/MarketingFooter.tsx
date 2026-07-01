import Link from "next/link";
import Image from "next/image";

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
            <p className="text-[rgba(255,255,255,.48)] text-[.845rem] leading-[1.75] mb-5 font-poppins">
              PZ Academy by Pharmacozyme is committed to advancing pharmaceutical education through high-quality courses, expert mentorship, and clinical training.
            </p>
            <div className="flex gap-2.5 flex-wrap">
              {[
                { label: "Facebook", d: "M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" },
                { label: "Instagram", paths: ["rect x='2' y='2' width='20' height='20' rx='5'", "path d='M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z'", "line x1='17.5' y1='6.5' x2='17.51' y2='6.5'"] },
                { label: "LinkedIn", d: "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" },
                { label: "YouTube", d: "M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z" },
              ].map(({ label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-[34px] h-[34px] rounded-full bg-[rgba(255,255,255,.06)] flex items-center justify-center transition-all duration-200 hover:bg-pz-mid hover:-translate-y-1 hover:shadow-[0_6px_16px_rgba(45,138,84,.35)]"
                >
                  <svg viewBox="0 0 24 24" className="w-[15px] h-[15px] fill-[rgba(255,255,255,.68)]">
                    {label === "Facebook" && <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />}
                    {label === "Instagram" && <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>}
                    {label === "LinkedIn" && <><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></>}
                    {label === "YouTube" && <><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z" /><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" /></>}
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-[.72rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.35)] mb-5 font-montserrat">Quick Links</h4>
            <ul className="flex flex-col gap-2.5">
              {[["Home", "/"], ["Courses", "/courses"], ["Webinars", "/webinars"], ["Workshops", "/workshops"], ["MED-Q", "#"], ["Blogs", "#"]].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-[.845rem] text-[rgba(255,255,255,.58)] font-poppins transition-all duration-200 hover:text-pz-bright hover:pl-1 inline-block">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-[.72rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.35)] mb-5 font-montserrat">Services</h4>
            <ul className="flex flex-col gap-2.5">
              {[["All Courses", "/courses"], ["Mentorship", "https://pz-academy.pharmacozyme.com/mentorship"], ["Become an Affiliate", "#"], ["Join as Ambassador", "#"], ["Opportunities", "#"], ["Our Team", "#"]].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-[.845rem] text-[rgba(255,255,255,.58)] font-poppins transition-all duration-200 hover:text-pz-bright hover:pl-1 inline-block">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-[.72rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.35)] mb-5 font-montserrat">Contact</h4>
            <ul className="flex flex-col gap-2.5">
              {[["info@pharmacozyme.com", "mailto:info@pharmacozyme.com"], ["Seminars", "#"], ["Workshops", "/workshops"], ["Privacy Policy", "#"]].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-[.845rem] text-[rgba(255,255,255,.58)] font-poppins transition-all duration-200 hover:text-pz-bright hover:pl-1 inline-block">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-[.775rem] text-[rgba(255,255,255,.28)] font-poppins">© 2026 PZ Academy by Pharmacozyme. All rights reserved.</p>
          <p className="text-[.775rem] text-[rgba(255,255,255,.28)] font-poppins">Educating with Innovation</p>
        </div>
      </div>
    </footer>
  );
}
