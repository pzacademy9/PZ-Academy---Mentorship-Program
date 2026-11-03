"use client";

import { createContext, useContext } from "react";

const TermsHref = createContext<string | undefined>(undefined);

/** The page's Terms and Conditions address, or nothing when the page has none. */
export function TermsLinkProvider({ href, children }: { href?: string; children: React.ReactNode }) {
  return <TermsHref.Provider value={href}>{children}</TermsHref.Provider>;
}

export const useTermsHref = (): string | undefined => useContext(TermsHref);
