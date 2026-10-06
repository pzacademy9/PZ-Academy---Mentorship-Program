import { hubPath } from "./sales-hub-routes";

export type HubOverview = { contactsTotal: number; unassigned: number; activeAgents: number; frozenNumbers: number };
export type HubCard = { label: string; value: number; href: string; tone: "normal" | "warn" };

export function hubOverviewCards(o: HubOverview): HubCard[] {
  return [
    { label: "Contacts", value: o.contactsTotal, href: hubPath("contacts"), tone: "normal" },
    { label: "Unassigned", value: o.unassigned, href: hubPath("assign"), tone: "normal" },
    { label: "Sales agents", value: o.activeAgents, href: hubPath("team"), tone: "normal" },
    { label: "Frozen numbers", value: o.frozenNumbers, href: hubPath("safety"), tone: o.frozenNumbers > 0 ? "warn" : "normal" },
  ];
}
