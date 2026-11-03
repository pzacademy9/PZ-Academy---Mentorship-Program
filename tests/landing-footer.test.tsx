import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LandingFooter } from "@/components/landing/LandingFooter";
import { SITE_LOGO_ALT, SITE_LOGO_URL } from "@/lib/site-logo";

const html = () => renderToStaticMarkup(<LandingFooter title="Fake Course" items={[{ id: "a", label: "Benefits" }]} whatsapp="923000000000" />);

describe("landing footer", () => {
  it("shows the same PZ Academy logo as the top bar, not a letter block", () => {
    const o = html();
    expect(o).toContain(SITE_LOGO_URL);
    expect(o).toContain(`alt="${SITE_LOGO_ALT}"`);
    expect(o).not.toMatch(/>PZ<\/span>/);
  });

  it("shows the academy email and not the old one", () => {
    const o = html();
    expect(o).toContain("mailto:pz.academy9@gmail.com");
    expect(o).toContain("pz.academy9@gmail.com");
    expect(o).not.toContain("info@pharmacozyme.com");
  });

  it("keeps the course title, the page links and the WhatsApp link", () => {
    const o = html();
    expect(o).toContain("Fake Course");
    expect(o).toContain('href="#a"');
    expect(o).toContain("https://wa.me/923000000000");
  });
});
