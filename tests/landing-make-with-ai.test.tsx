import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { MakeWithAi } from "@/components/admin/landing/MakeWithAi";

const prompts = { course: "COURSE PROMPT TEXT", workshop: "WORKSHOP PROMPT TEXT", webinar: "WEBINAR PROMPT TEXT" };
const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("MakeWithAi", () => {
  it("offers three kinds with Course selected by default", () => {
    render(<MakeWithAi prompts={prompts} />);
    expect(screen.getByRole("button", { name: "Course" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Workshop" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Webinar" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the three plain steps", () => {
    render(<MakeWithAi prompts={prompts} />);
    expect(screen.getByText("1. Copy the instructions below.")).toBeTruthy();
    expect(screen.getByText("2. Open your AI chat (ChatGPT, Claude or Gemini), paste the instructions and attach your course document.")).toBeTruthy();
    expect(screen.getByText("3. Answer its questions. When it gives you the final file, save it as a .md file, then use Import .md on the Landing Pages list.")).toBeTruthy();
  });

  it("previews the selected instructions", () => {
    render(<MakeWithAi prompts={prompts} />);
    expect((screen.getByLabelText("Instructions preview") as HTMLTextAreaElement).value).toBe("COURSE PROMPT TEXT");
    fireEvent.click(screen.getByRole("button", { name: "Webinar" }));
    expect((screen.getByLabelText("Instructions preview") as HTMLTextAreaElement).value).toBe("WEBINAR PROMPT TEXT");
  });

  it("copies the selected kind and shows Copied; switching kind resets and copies the new text", async () => {
    render(<MakeWithAi prompts={prompts} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy instructions" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("COURSE PROMPT TEXT");
    fireEvent.click(screen.getByRole("button", { name: "Workshop" }));
    expect(screen.getByRole("button", { name: "Copy instructions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy instructions" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("WORKSHOP PROMPT TEXT"));
  });

  it("shows a fallback message when the clipboard fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<MakeWithAi prompts={prompts} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy instructions" }));
    await waitFor(() => expect(screen.getByText("Could not copy. Select the text below and copy it yourself.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("links back to the list", () => {
    render(<MakeWithAi prompts={prompts} />);
    expect(screen.getByRole("link", { name: "Back to Landing Pages" }).getAttribute("href")).toBe("/dashboard/admin/landing-pages");
    expect(screen.getByRole("link", { name: "Import .md" }).getAttribute("href")).toBe("/dashboard/admin/landing-pages");
  });
});
