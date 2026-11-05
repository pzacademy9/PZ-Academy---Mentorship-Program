import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { Mentor } from "@/lib/data/mentors";
import type { MentorReview, MentorReviewSummary } from "@/lib/data/mentor-reviews";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import MentorProfileClient from "@/components/mentorship/MentorProfileClient";
import BookingClient from "@/components/mentorship/BookingClient";
import { ThankYouClient } from "@/components/mentorship/ThankYouClient";
import {
  BOOKING_SUMMARY_KEY,
  PAYMENT_ACCOUNTS,
  bookingRef,
  bookingStep,
  parseBookingRef,
  pickPackage,
  screenshotProblem,
} from "@/lib/mentorship/booking";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.push.mockReset();
  sessionStorage.clear();
});

const fakeMentor = (over: Partial<Mentor> = {}): Mentor => ({
  id: "m1", slug: "fake-mentor", name: "Dr Fake Mentor", title: "Fake Clinical Pharmacist", expertise: "Fake Expertise",
  shortBio: "Short fake bio.", fullBio: ["First fake paragraph.", "Second fake paragraph."], photo: "",
  experience: "Fake 5 years", domain: "Clinical Pharmacy", language: "English, Urdu", format: "Google Meet",
  pricePerSession: 3000,
  packages: [
    { name: "Single fake session", sessions: 1, price: 3000 },
    { name: "Three fake sessions", sessions: 3, price: 8000, savings: 1000 },
  ],
  availability: "Fake weekends", leadTime: "Fake 2 days", timezone: "PKT",
  credentials: [{ title: "Fake PharmD", institution: "Fake University", icon: "GraduationCap" }],
  skills: ["Fake Skill A", "Fake Skill B"],
  introVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk", linkedinUrl: "https://linkedin.com/in/fake",
  socialLinks: [], testimonials: [{ quote: "Fake quote.", author: "Fake Author", role: "Fake role" }],
  sessionDurationMinutes: 45, sessionDurationText: "45 minutes", showReviews: true, tier: "standard",
  ...over,
});

const noReviews: MentorReviewSummary = { avg: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
const someReviews: MentorReviewSummary = { avg: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } };
const reviews: MentorReview[] = [
  { id: "r1", name: "Fake Student", submittedAt: "2026-10-01T00:00:00Z", avgStars: 5, comment: "Fake helpful.", sessionName: "Fake session", isFeatured: false },
];

const MADE_UP = /94%|12\+|Next slot|Tomorrow|Queue|Raast|100% Encrypted|Rescheduling|Farhan|PK72FAYS/;

describe("booking helpers", () => {
  it("makes a short reference from the booking id", () => {
    expect(bookingRef("3f2a9c1e-1111-2222-3333-444455556666")).toBe("PZM-3F2A9C");
    expect(bookingRef(null)).toBeNull();
  });
  it("accepts only a well-formed reference", () => {
    expect(parseBookingRef("PZM-3F2A9C")).toBe("PZM-3F2A9C");
    expect(parseBookingRef("pzm-3f2a9c")).toBe("PZM-3F2A9C");
    expect(parseBookingRef("<script>")).toBeNull();
    expect(parseBookingRef(undefined)).toBeNull();
    expect(parseBookingRef(["PZM-3F2A9C"])).toBeNull();
  });
  it("checks the payment file the same way as before (JPG, PNG or PDF, up to 5 MB)", () => {
    expect(screenshotProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(screenshotProblem({ type: "image/gif", size: 1000 })).toMatch(/JPG, PNG or PDF/);
    expect(screenshotProblem({ type: "application/pdf", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
  it("picks a package only when it really exists", () => {
    const m = fakeMentor();
    expect(pickPackage(m.packages, "Three fake sessions")).toBe("Three fake sessions");
    expect(pickPackage(m.packages, "Nope")).toBe("");
    expect(pickPackage(m.packages, undefined)).toBe("");
  });
  it("works out the current step", () => {
    expect(bookingStep("", false)).toBe(1);
    expect(bookingStep("P", false)).toBe(2);
    expect(bookingStep("P", true)).toBe(3);
  });
  it("keeps the real payment accounts", () => {
    const all = JSON.stringify(PAYMENT_ACCOUNTS);
    expect(all).toContain("3573499000006913");
    expect(all).toContain("03401940624");
    expect(all).toContain("@PharmacozymeOfficial");
  });
  it("keeps the helpers in a file that is not a client file", () => {
    expect(readFileSync("src/lib/mentorship/booking.ts", "utf8")).not.toMatch(/^["']use client["']/m);
  });
});

describe("mentor profile", () => {
  it("shows every admin-managed part of the profile", () => {
    render(<MentorProfileClient mentor={fakeMentor()} reviewSummary={someReviews} reviews={reviews} />);
    expect(screen.getByRole("heading", { level: 1, name: "Dr Fake Mentor" })).toBeTruthy();
    expect(screen.getAllByText("Fake Clinical Pharmacist").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clinical Pharmacy").length).toBeGreaterThan(0);
    expect(screen.getByText("First fake paragraph.")).toBeTruthy();
    expect(screen.getByText("Second fake paragraph.")).toBeTruthy();
    expect(screen.getByText("Fake Skill B")).toBeTruthy();
    expect(screen.getByText("Fake PharmD")).toBeTruthy();
    expect(screen.getByText("Fake University")).toBeTruthy();
    expect(screen.getByTitle("Dr Fake Mentor introduction")).toBeTruthy();
    expect(screen.getByText("Fake helpful.")).toBeTruthy();
    expect(screen.getByText("Fake quote.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /LinkedIn/ }).getAttribute("href")).toBe("https://linkedin.com/in/fake");
    const details = screen.getByRole("region", { name: "Session details" });
    for (const t of ["45 minutes", "Google Meet", "English, Urdu", "Fake weekends", "Fake 2 days", "PKT"]) {
      expect(within(details).getByText(t)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "All mentors" }).getAttribute("href")).toBe("/mentorship");
    expect(document.body.textContent).not.toMatch(MADE_UP);
  });

  it("chooses a package in the side card and carries it to the booking page", () => {
    render(<MentorProfileClient mentor={fakeMentor()} reviewSummary={noReviews} reviews={[]} />);
    const card = screen.getByRole("region", { name: "Book a 1-on-1 session" });
    expect(within(card).getByText("PKR 3,000", { selector: "[data-total]" })).toBeTruthy();
    fireEvent.click(within(card).getByRole("radio", { name: /Three fake sessions/ }));
    expect(within(card).getByText("PKR 8,000", { selector: "[data-total]" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Book a session now/ }).getAttribute("href")).toBe(
      "/mentorship/book/fake-mentor?package=Three%20fake%20sessions",
    );
  });

  it("hides reviews when the mentor turned them off, and hides empty parts", () => {
    render(
      <MentorProfileClient
        mentor={fakeMentor({ showReviews: false, introVideoUrl: "", testimonials: [], linkedinUrl: "", credentials: [], skills: [] })}
        reviewSummary={someReviews}
        reviews={reviews}
      />,
    );
    expect(screen.queryByText("Fake helpful.")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Credentials/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Intro video/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Connect/ })).toBeNull();
  });

  it("shows a star rating in the top only with real reviews", () => {
    const { unmount } = render(<MentorProfileClient mentor={fakeMentor()} reviewSummary={noReviews} reviews={[]} />);
    expect(screen.queryByLabelText(/out of 5 stars/)).toBeNull();
    unmount();
    render(<MentorProfileClient mentor={fakeMentor()} reviewSummary={someReviews} reviews={reviews} />);
    expect(screen.getAllByLabelText("4.5 out of 5 stars").length).toBeGreaterThan(0);
  });
});

describe("booking page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, id: "3f2a9c1e-1111-2222-3333-444455556666" }), { status: 200 })));
  });

  it("shows the real payment accounts with copy buttons and no made-up promises", () => {
    render(<BookingClient mentor={fakeMentor()} />);
    for (const a of PAYMENT_ACCOUNTS) {
      expect(screen.getByRole("button", { name: `Copy ${a.copy}` })).toBeTruthy();
    }
    expect(screen.getAllByRole("link", { name: /WhatsApp/i }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(MADE_UP);
  });

  it("starts on the package chosen on the profile and updates the summary", () => {
    render(<BookingClient mentor={fakeMentor()} initialPackage="Three fake sessions" />);
    const pick = screen.getByRole("radio", { name: /Three fake sessions/ }) as HTMLInputElement;
    expect(pick.checked).toBe(true);
    const summary = screen.getByRole("region", { name: "Booking summary" });
    expect(within(summary).getByText("PKR 8,000", { selector: "[data-total]" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Single fake session/ }));
    expect(within(summary).getByText("PKR 3,000", { selector: "[data-total]" })).toBeTruthy();
  });

  it("tells the student when the payment file is wrong", () => {
    render(<BookingClient mentor={fakeMentor()} />);
    const input = screen.getByLabelText("Payment screenshot file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "fake.gif", { type: "image/gif" })] } });
    expect(screen.getByRole("alert").textContent).toMatch(/JPG, PNG or PDF/);
  });

  it("sends the same booking fields as before and opens the thank-you page with the reference", async () => {
    render(<BookingClient mentor={fakeMentor()} />);
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Fake Student" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "fake@example.com" } });
    fireEvent.change(screen.getByLabelText(/WhatsApp number/), { target: { value: "+92 300 0000000" } });
    fireEvent.click(screen.getByRole("radio", { name: /Single fake session/ }));
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: "Fake goal" } });
    fireEvent.change(screen.getByLabelText("Payment screenshot file"), {
      target: { files: [new File(["x"], "fake.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Complete booking/ }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/mentorship/thank-you?ref=PZM-3F2A9C"));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/mentorship/bookings");
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(
      ["email", "fullName", "goals", "mentorName", "mentorSlug", "packageName", "phone", "screenshotBase64", "screenshotMimeType", "screenshotName"].sort(),
    );
    expect(body).toMatchObject({
      fullName: "Fake Student", email: "fake@example.com", phone: "+92 300 0000000", mentorSlug: "fake-mentor",
      mentorName: "Dr Fake Mentor", packageName: "Single fake session", goals: "Fake goal",
      screenshotName: "fake.png", screenshotMimeType: "image/png",
    });
    const saved = JSON.parse(sessionStorage.getItem(BOOKING_SUMMARY_KEY) ?? "{}");
    expect(saved).toMatchObject({ ref: "PZM-3F2A9C", mentorName: "Dr Fake Mentor", packageName: "Single fake session", price: 3000 });
  });
});

describe("thank-you page", () => {
  it("shows the reference code and the booking summary", () => {
    sessionStorage.setItem(
      BOOKING_SUMMARY_KEY,
      JSON.stringify({ ref: "PZM-3F2A9C", mentorName: "Dr Fake Mentor", mentorTitle: "Fake title", mentorPhoto: "", packageName: "Single fake session", price: 3000, fullName: "Fake Student" }),
    );
    render(<ThankYouClient refCode="PZM-3F2A9C" />);
    expect(screen.getByRole("heading", { level: 1, name: "Booking received!" })).toBeTruthy();
    expect(screen.getByText("PZM-3F2A9C")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy PZM-3F2A9C" })).toBeTruthy();
    expect(screen.getByText("Dr Fake Mentor")).toBeTruthy();
    expect(screen.getByText("Single fake session")).toBeTruthy();
    expect(screen.getByText("PKR 3,000")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to all mentors/ }).getAttribute("href")).toBe("/mentorship");
    expect(document.body.textContent).not.toMatch(MADE_UP);
  });

  it("still works without a reference or saved summary", () => {
    render(<ThankYouClient refCode={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Booking received!" })).toBeTruthy();
    expect(screen.queryByText(/PZM-/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Booking summary" })).toBeNull();
  });

  it("ignores a saved summary for a different booking", () => {
    sessionStorage.setItem(BOOKING_SUMMARY_KEY, JSON.stringify({ ref: "PZM-000000", mentorName: "Dr Other Fake", packageName: "X", price: 1 }));
    render(<ThankYouClient refCode="PZM-3F2A9C" />);
    expect(screen.queryByText("Dr Other Fake")).toBeNull();
  });
});

describe("admin bookings list", () => {
  it("shows each booking's reference code", () => {
    const src = readFileSync("src/app/dashboard/admin/mentorship/page.tsx", "utf8");
    expect(src.match(/bookingRef\(b\.id\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
