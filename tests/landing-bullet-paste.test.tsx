import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { FieldInput } from "@/components/admin/landing/FieldInput";
import type { FieldDef } from "@/lib/landing/sections";

const field: FieldDef = { key: "body", label: "Body", kind: "textarea", max: 2000 };

function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState<unknown>(initial);
  return <FieldInput field={field} value={v} onChange={setV} />;
}

function paste(el: HTMLElement, text: string) {
  const ev = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  ev.clipboardData = { getData: (t: string) => (t === "text/plain" ? text : "") };
  fireEvent(el, ev);
  return ev;
}

describe("textarea bullet paste", () => {
  it("converts pasted bullets into a - list in an empty field", () => {
    render(<Harness />);
    const ta = screen.getByLabelText("Body") as HTMLTextAreaElement;
    const ev = paste(ta, "• a\n● b\n1. c");
    expect(ev.defaultPrevented).toBe(true);
    expect(ta.value).toBe("- a\n- b\n- c");
    expect(ta.selectionStart).toBe(ta.value.length);
  });

  it("inserts at the caret, replacing the selection, and restores the caret after it", () => {
    render(<Harness initial="Hello WORLD end" />);
    const ta = screen.getByLabelText("Body") as HTMLTextAreaElement;
    ta.setSelectionRange(6, 11);
    paste(ta, "• x\n• y");
    expect(ta.value).toBe("Hello - x\n- y end");
    expect(ta.selectionStart).toBe(6 + "- x\n- y".length);
    expect(ta.selectionEnd).toBe(ta.selectionStart);
  });

  it("does not intercept plain text pastes", () => {
    render(<Harness initial="abc" />);
    const ta = screen.getByLabelText("Body") as HTMLTextAreaElement;
    const ev = paste(ta, "just some text");
    expect(ev.defaultPrevented).toBe(false);
    expect(ta.value).toBe("abc");
  });

  it("leaves typing alone", () => {
    render(<Harness />);
    const ta = screen.getByLabelText("Body") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "• typed" } });
    expect(ta.value).toBe("• typed");
  });
});
