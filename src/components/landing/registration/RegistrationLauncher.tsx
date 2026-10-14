"use client";

import { openRegistration, prefetchRegistration } from "./registration-bus";

/**
 * Opens the registration modal. With a safe `href` it renders a real link, so before hydration or
 * without JS it still behaves like the old Register link; with JS it opens the modal instead.
 */
export function RegistrationLauncher({ className, children, href }: { className: string; children: React.ReactNode; href?: string }) {
  if (href) {
    return (
      <a
        href={href}
        aria-haspopup="dialog"
        className={className}
        onClick={(e) => {
          // Let new-tab / new-window gestures behave like a normal link.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          openRegistration(e.currentTarget);
        }}
        onPointerEnter={prefetchRegistration}
        onFocus={prefetchRegistration}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={className}
      onClick={(e) => openRegistration(e.currentTarget)}
      onPointerEnter={prefetchRegistration}
      onFocus={prefetchRegistration}
    >
      {children}
    </button>
  );
}
