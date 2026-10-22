import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegistrationSetup } from "@/components/admin/landing/registration/RegistrationSetup";
import { StepChoose } from "@/components/landing/registration/StepChoose";
import { initialState } from "@/lib/landing/registration/form-state";
import { ppcConfig } from "./fixtures/registration-fixtures";

const recordedOnly = { ...ppcConfig, modes: ["recorded" as const], recordedPercentOfRegular: 80 };

describe("recorded-only landing page UI", () => {
  it("(g) the admin shows the recorded percent input while live is off", () => {
    render(<RegistrationSetup registration={recordedOnly} step="buy" onStep={vi.fn()} onChange={vi.fn()} />);
    expect((screen.getByLabelText("Recorded price, % of the regular price") as HTMLInputElement).value).toBe("80");
    expect((screen.getByRole("checkbox", { name: /live sessions/i }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: /recorded lectures/i }) as HTMLInputElement).checked).toBe(true);
  });
  it("(d) the visitor form shows no mode selector with one mode", () => {
    const state = initialState(recordedOnly, { country: "PK", me: null });
    render(<StepChoose config={recordedOnly} state={state} errors={{}} notice={null} isFree={false}
      onRegion={vi.fn()} onMode={vi.fn()} onToggleOption={vi.fn()} onTier={vi.fn()} onGroupSize={vi.fn()} />);
    expect(screen.queryByText("How do you want to learn?")).toBeNull();
    expect(screen.queryByText("Live sessions")).toBeNull();
  });
});
