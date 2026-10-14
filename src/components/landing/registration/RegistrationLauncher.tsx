"use client";

import { openRegistration, prefetchRegistration } from "./registration-bus";

export function RegistrationLauncher({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={className}
      onClick={() => openRegistration()}
      onPointerEnter={prefetchRegistration}
      onFocus={prefetchRegistration}
    >
      {children}
    </button>
  );
}
