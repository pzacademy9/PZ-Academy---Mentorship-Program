import { render, screen, fireEvent, within } from "@testing-library/react";
import { ResponsiveList } from "@/components/ui/responsive-list";

type Row = { id: string; name: string; email: string; phone: string };
const rows: Row[] = [
  { id: "1", name: "Abdul Wajid", email: "a@x.com", phone: "+92311" },
  { id: "2", name: "Sadia Yousuf", email: "s@x.com", phone: "+92316" },
];

it("renders cards with title and meta on mobile markup and keeps the table for desktop", () => {
  render(
    <ResponsiveList
      rows={rows}
      getKey={(r) => r.id}
      mobile={{ title: (r) => r.name, meta: (r) => [r.email, r.phone], href: (r) => `/c/${r.id}` }}
      table={<table data-testid="desktop-table"><tbody /></table>}
    />,
  );
  const cards = screen.getByTestId("responsive-cards");
  expect(cards.className).toContain("md:hidden");
  const items = within(cards).getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByRole("link", { name: /abdul wajid/i }).getAttribute("href")).toBe("/c/1");
  expect(within(items[0]).getByText("a@x.com")).toBeTruthy();
  expect(screen.getByTestId("desktop-table").parentElement!.className).toContain("hidden md:block");
});

it("selection checkbox toggles and has a 44px hit area", () => {
  const onToggle = vi.fn();
  render(
    <ResponsiveList
      rows={rows}
      getKey={(r) => r.id}
      mobile={{ title: (r) => r.name }}
      table={<table />}
      selection={{ isSelected: (r) => r.id === "1", onToggle, label: (r) => `Select ${r.name}` }}
    />,
  );
  const box = screen.getByRole("checkbox", { name: "Select Sadia Yousuf" });
  expect(box.closest("label")!.className).toContain("min-h-11");
  fireEvent.click(box);
  expect(onToggle).toHaveBeenCalledWith(rows[1]);
  expect((screen.getByRole("checkbox", { name: "Select Abdul Wajid" }) as HTMLInputElement).checked).toBe(true);
});

it("shows the empty node instead of cards and table when there are no rows", () => {
  render(<ResponsiveList rows={[]} getKey={() => ""} mobile={{ title: () => "" }}
    table={<table data-testid="t" />} empty={<p>Nothing here</p>} />);
  expect(screen.getByText("Nothing here")).toBeTruthy();
  expect(screen.queryByTestId("t")).toBeNull();
});
