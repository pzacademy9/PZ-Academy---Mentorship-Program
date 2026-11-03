// src/components/landing/PhoneScrollReveal.tsx
"use client";

import { useEffect, useState } from "react";

/**
 * Phone only: keeps its children out of sight while the hero section is on screen, then fades them in
 * once the hero has scrolled away. Bigger screens always show them. With no hero id the children are
 * always shown. Starts hidden when there is a hero so a visitor at the top never sees a flash of them.
 */
export function PhoneScrollReveal({ heroId, className, children }: { heroId?: string; className: string; children: React.ReactNode }) {
  const [heroOnScreen, setHeroOnScreen] = useState(!!heroId);

  useEffect(() => {
    if (!heroId) return;
    const hero = document.getElementById(heroId);
    // Watch the hero's own Register button row; a hero without one falls back to the whole section.
    const el = hero?.querySelector("[data-hero-cta]") ?? hero;
    if (!el || typeof IntersectionObserver === "undefined") {
      setHeroOnScreen(false);
      return;
    }
    // The sticky header (and countdown strip) cover the top of the screen, so count that strip as not visible.
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setHeroOnScreen(last.isIntersecting);
    }, { rootMargin: "-120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [heroId]);

  const hide = heroId && heroOnScreen;
  return (
    <div
      data-phone-hidden={hide ? "true" : "false"}
      className={`${className} transition-all duration-200 ${hide ? "max-md:invisible max-md:pointer-events-none max-md:translate-y-4 max-md:opacity-0" : ""}`}
    >
      {children}
    </div>
  );
}
