import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { Mentor } from "@/lib/data/mentors";

vi.mock("@/lib/landing/compress-image", () => ({ compressImage: async (f: File) => f }));

import { MentorshipCatalog } from "@/components/mentorship/MentorshipCatalog";
import { PremiumMentorCard } from "@/components/mentorship/PremiumMentorCard";
import { BecomeMentorBand, HowItWorks } from "@/components/mentorship/MentorshipSections";
import { MentorApplicationForm } from "@/components/mentorship/MentorApplicationForm";
import { filterMentors, mentorFields, priceFrom, trustFacts } from "@/lib/mentorship/catalog";
import { cvProblem, imageMime, photoProblem } from "@/lib/mentorship/apply-files";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mentor = (n: number, over: Partial<Mentor> = {}): Mentor => ({
  id: `m${n}`, slug: `fake-${n}`, name: `Dr Fake Mentor ${n}`, title: "Fake Clinical Pharmacist", expertise: "Fake Expertise",
  shortBio: "", fullBio: [], photo: "", experience: "", domain: "Clinical Pharmacy", language: "", format: "",
  pricePerSession: 3000, packages: [], availability: "", leadTime: "", credentials: [], skills: [],
  introVideoUrl: "", linkedinUrl: "", socialLinks: [], testimonials: [], sessionDurationMinutes: 45, sessionDurationText: "45 min",
  timezone: "", showReviews: true, tier: "standard", ...over,
});

describe("catalog helpers", () => {
  const ms = [mentor(1), mentor(2, { domain: "Careers", skills: ["CV Review"] }), mentor(3, { domain: "", expertise: "Research" })];
  it("lists each field once, A to Z", () => expect(mentorFields(ms)).toEqual(["Careers", "Clinical Pharmacy", "Research"]));
  it("filters by field and by search over name, title and skills", () => {
    expect(filterMentors(ms, "careers", "").map((m) => m.id)).toEqual(["m2"]);
    expect(filterMentors(ms, null, "cv rev").map((m) => m.id)).toEqual(["m2"]);
    expect(filterMentors(ms, "Research", "nothing")).toEqual([]);
  });
  it("from-price is the lowest per session, packages included", () => {
    expect(priceFrom({ pricePerSession: 4000, packages: [{ sessions: 3, price: 9000 }] })).toBe(3000);
    expect(priceFrom({ pricePerSession: 0, packages: [] })).toBeNull();
  });
  it("trust facts are real counts", () => expect(trustFacts(ms, [2, 0, 3])).toEqual({ mentors: 3, fields: 3, reviews: 5 }));
});

describe("mentor card", () => {
  it("shows the real fee, fields, availability and both buttons; no rating without reviews", () => {
    render(<PremiumMentorCard mentor={mentor(1, { skills: ["Fake Skill A", "Fake Skill B"], availability: "Weekends", packages: [{ name: "P", sessions: 2, price: 5000 }] })} />);
    const card = screen.getByRole("article", { name: "Dr Fake Mentor 1" });
    expect(within(card).getByText("PKR 2,500", { exact: false })).toBeTruthy();
    expect(within(card).getByText("Clinical Pharmacy")).toBeTruthy();
    expect(within(card).getByText("Fake Skill B")).toBeTruthy();
    expect(within(card).getByText("Weekends")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /View profile/ }).getAttribute("href")).toBe("/mentorship/mentors/fake-1");
    expect(within(card).getByRole("link", { name: /Book a session/ }).getAttribute("href")).toBe("/mentorship/book/fake-1");
    expect(within(card).queryByText(/review/)).toBeNull();
  });
  it("shows the rating only with real reviews", () => {
    render(<PremiumMentorCard mentor={mentor(1)} rating={{ avg: 4.8, count: 3, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 } }} />);
    expect(screen.getByText("4.8")).toBeTruthy();
    expect(screen.getByText("(3 reviews)")).toBeTruthy();
  });
});

describe("mentorship catalog", () => {
  const ms = [
    mentor(1, { tier: "elite" }),
    mentor(2, { domain: "Careers" }),
    mentor(3),
  ];
  it("shows real trust facts and no made-up numbers", () => {
    render(<MentorshipCatalog mentors={ms} ratings={{}} />);
    const trust = screen.getByRole("region", { name: "Why book with PZ Academy" });
    expect(within(trust).getByText("3 verified mentors")).toBeTruthy();
    expect(within(trust).getByText("2 fields")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/500\+|98%|100%/);
  });
  it("splits top mentors from the rest, and filters by field and search", () => {
    render(<MentorshipCatalog mentors={ms} ratings={{}} />);
    expect(screen.getByRole("heading", { name: "Top mentors" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "All mentors" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Fields" })).getByRole("button", { name: "Careers" }));
    expect(screen.queryByRole("heading", { name: "Top mentors" })).toBeNull();
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Dr Fake Mentor 2"]);
    expect(screen.getByText("1 mentor available")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search mentors" }), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Show all mentors" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("says so when there are no mentors yet", () => {
    render(<MentorshipCatalog mentors={[]} ratings={{}} />);
    expect(screen.getByText(/New mentors are joining soon/)).toBeTruthy();
  });
});

describe("sections", () => {
  it("how it works has four steps and the apply band links to the apply page", () => {
    render(<><HowItWorks /><BecomeMentorBand /></>);
    expect(within(screen.getByRole("region", { name: "How 1-on-1 mentorship works" })).getAllByRole("listitem")).toHaveLength(4);
    const band = screen.getByRole("region", { name: "Share your clinical expertise" });
    expect(band.id).toBe("apply");
    for (const t of ["Flexible schedule", "Paid per session", "Verified PZ Academy badge"]) expect(within(band).getByText(t)).toBeTruthy();
    expect(within(band).getByRole("link", { name: /Start my application/ }).getAttribute("href")).toBe("/mentorship/apply");
  });
});

describe("application files", () => {
  it("checks type and size in plain words", () => {
    expect(cvProblem({ name: "cv.pdf", size: 100 })).toBeNull();
    expect(cvProblem({ name: "cv.png", size: 100 })).toMatch(/PDF or Word/);
    expect(cvProblem({ name: "cv.pdf", size: 3 * 1024 * 1024 })).toMatch(/under 2 MB/);
    expect(photoProblem({ name: "p.webp", type: "image/webp", size: 2 * 1024 * 1024 })).toMatch(/under 1 MB/);
    expect(imageMime("p.webp")).toBe("image/webp");
    expect(imageMime("p.JPG")).toBe("image/jpeg");
  });
});

describe("application form", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const next = () => fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

  it("walks five steps and sends the same fields as before", async () => {
    render(<MentorApplicationForm />);
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    type(/Full name/, "Dr Fake Applicant");
    type(/Email address/, "fake@example.com");
    type(/WhatsApp number/, "+92 300 0000000");
    type(/Country you live in/, "Pakistan");
    next();
    type(/^Profession/, "Pharmacist");
    type(/Current position/, "Fake Pharmacist");
    type(/Areas of expertise/, "Fake A, Fake B");
    type(/Hospital, company or university/, "Fake Hospital");
    type(/Years of experience/, "5 years");
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: /Mentor & Consultant/ }));
    next();
    next();
    fireEvent.change(screen.getByLabelText("CV or resume file"), { target: { files: [new File(["cv"], "cv.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByLabelText("Professional photo file"), { target: { files: [new File(["p"], "me.png", { type: "image/png" })] } });
    const send = await screen.findByRole("button", { name: /Send application/ });
    await vi.waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/mentorship/applications");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ fullName: "Dr Fake Applicant", email: "fake@example.com", roles: "mentor", cvFileName: "cv.pdf", years: "5 years" });
    expect(body.photos).toHaveLength(1);
    expect(await screen.findByText("Application sent")).toBeTruthy();
  });
});

describe("apply page", () => {
  it("is linked from the student dashboard", () => {
    expect(readFileSync("src/app/dashboard/mentor-application/page.tsx", "utf8")).toContain('href="/mentorship/apply"');
  });
});
